'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const ui=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
for (const name of ['overview','cameras','recordings','events','schedules']) {
  assert.match(html,new RegExp(`id="surveillance-tab-${name}"`));
  assert.match(html,new RegExp(`id="surveillance-panel-${name}"`));
}
assert.match(html,/data-page="surveillance"[^\n]*<svg viewBox="0 0 24 24"/);
assert.match(html,/id="surveillance-usb-choice"/);
assert.match(html,/id="surveillance-usb-refresh"/);
assert.match(html,/id="surveillance-usb-manual-toggle"/);
assert.match(ui,/renderUsb\(/);
assert.match(ui,/surveillance\/usb-devices/);
assert.match(html,/id="surveillance-schedules-arm"/);
assert.match(ui,/Arm recording schedules for this OpenRF session/);
assert.match(ui,/surveillance-alert-toggle/);
assert.match(ui,/Notification\.requestPermission\(\)/);
assert.match(css,/surveillance-schedule-list\{/);
console.log('Surveillance v185 USB picker, schedule, local alert and camera sidebar icon checks passed');
