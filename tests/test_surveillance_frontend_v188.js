/* v188: viewport overlays, honest in-progress media, no unnecessary grid fullscreen. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
for(const control of ['data-feed-record','data-feed-fullscreen','data-feed-snapshot','data-feed-zoom-in',
                      'data-feed-zoom-out','data-feed-view','data-feed-history','data-feed-ptz-toggle']) {
  assert.match(ui,new RegExp(control));
}
assert.match(ui, /class="surveillance-overlay-bottom"/);
assert.match(ui, /class="surveillance-overlay-top"/);
assert.match(css, /\.surveillance-feed-media img\{position:absolute[^}]*object-fit:cover/);
assert.match(css, /\.surveillance-overlay-bottom\{position:absolute/);
assert.match(ui, /surveillance-fullscreen'\)\.hidden = live.size < 2/);
assert.match(ui, /classList\.toggle\('has-multiple', live\.size > 1\)/);
assert.match(css, /#surveillance-fullscreen\[hidden\]\{display:none!important\}/);
assert.match(html, /surveillance-fullscreen" hidden>Expand grid/);
assert.match(ui, /Stop & save to finalize MP4/);
assert.match(ui, /if \(active\) \{/);
assert.match(ui, /Stop & save/);
assert.match(ui, /entry\.state === 'STOPPED' \|\| entry\.state === 'FINISHED'/);
assert.match(ui, /recordingInfo\.set\(item\.camera_id,item\)/);
assert.match(ui, /if \(live\.size >= MAX_LIVE\)/);
assert.match(ui, /Math\.max\(-limit, Math\.min\(limit, state\.x\)\)/);
console.log('Surveillance v188 overlay UX and honest recording history assertions passed');
