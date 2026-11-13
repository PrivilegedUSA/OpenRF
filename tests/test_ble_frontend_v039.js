'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const staticDir = path.join(__dirname, '..', 'openrf', 'static');
const html = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(staticDir, 'app.js'), 'utf8');
for(const id of ['scan-ble-once','ble-scan-status','live-ble-results']) {
  assert(html.includes(`id="${id}"`), `${id} should exist in Analysis page`);
}
assert(html.includes('No BLE scan requested'));
assert(js.includes("await api('/api/ble/scan', 'POST', {})"));
assert(js.includes("api('/api/sensors/linux-ble/save','POST'"));
assert(js.includes("scan_id:scan.scan_id,address,session_id:"));
assert(!js.includes("rssi_dbm:row.rssi_dbm"), 'Browser must not submit measured values');
assert(js.includes('function renderBleScan()'));
assert(js.includes('escapeHTML(row.name'));
assert(js.includes('escapeHTML(row.address)'));
assert(js.includes('state.bleScan = null;'), 'Failed requests must clear previous BLE scan');
assert(js.includes('atRequest.capturedAt'), 'BLE location should be from scan request, not save time');
assert(js.includes('No confirmed LE scan results'));
assert(js.includes("$('scan-ble-once').addEventListener('click', scanBleOnce)"));
console.log('v0.2.39 BLE on-demand UI, no auto-save, provenance and failure state checks passed');
