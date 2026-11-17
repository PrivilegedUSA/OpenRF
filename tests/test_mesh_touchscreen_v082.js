'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/mesh.js','utf8');
for(const id of ['mesh-chat-grid','mesh-conversation-column','mesh-compose-column'])
  assert(html.includes(`class="${id}"`));
assert(html.includes('id="mesh-diagnostics"'));
assert(css.includes('@media(min-width:700px) and (max-height:600px)'));
assert(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
assert(js.includes("diag.rf_reachability")===false);
assert(js.includes('Firmware version')&&js.includes('Unknown · not queried'));
assert(!js.includes('innerHTML'));
console.log('PASS v0.2.93 diagnostic honesty and compact landscape layout');
