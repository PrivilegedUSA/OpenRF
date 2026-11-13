'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['hardware-manager-summary','hardware-manager-entries','refresh-hardware'])
  assert(html.includes(`id="${id}"`), `Missing ${id}`);
assert(js.includes("api('/api/hardware/manager')"), 'Read-only endpoint is required');
assert(js.includes('function renderHardwareManager()'));
assert(js.includes('state.hardwareManager = hardwareManager'), 'Fresh status must replace stale status');
assert(js.includes('renderHardwareManager();'), 'Hardware panel should render after refresh');
assert(js.includes('escapeHTML(entry.evidence)') && js.includes('escapeHTML(entry.next_step)'), 'Device fields must be escaped');
assert(js.includes('No continuous RF capture is running or verified'));
assert(css.includes('.hardware-manager-entries{display:grid'));
assert(css.includes('@media(max-width:750px){.hardware-manager-entries{grid-template-columns:minmax(0,1fr)}'));
assert(!html.includes('Live RF receiver connected'), 'No fabricated live receiver label');
console.log('v0.2.44 hardware status matrix UI and privacy contracts passed');
