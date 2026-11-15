'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
for(const name of ['reticulum-panel','reticulum-enable','reticulum-disable',
  'reticulum-send','reticulum-address','reticulum-recipient','reticulum-messages'])
  assert(html.includes(`id="${name}"`),name);
assert(html.includes('/static/reticulum.js?v=0.2.83'));
assert(js.includes('PATH_REQUESTED_NOT_SENT'));
assert(js.includes("'/api/reticulum/start'"));
assert(js.includes("'/api/reticulum/stop'"));
assert(js.includes('el(\'reticulum-enable\').addEventListener(\'click\''));
assert(!js.includes('innerHTML'));
console.log('PASS v0.2.83 explicit Reticulum LAN controls and honest delivery states');
