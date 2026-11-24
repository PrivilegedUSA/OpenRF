'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const ui=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
for (const name of ['overview','cameras','recordings','events']) {
  assert.match(html,new RegExp(`id="surveillance-tab-${name}"`));
  assert.match(html,new RegExp(`id="surveillance-panel-${name}"`));
  assert.match(ui,new RegExp(`surveillance-tab-\\$\\{name\\}`));
}
assert.match(ui,/selectTab\('cameras'\)/);
assert.match(css,/surveillance-tabs\{[^}]*margin:/);
assert.match(css,/surveillance-tab-panel\[hidden\]/);
assert.match(html,/id="surveillance-live-motion-status"/);
assert.match(ui,/Start motion \+ clips/);
assert.match(ui,/stopMonitorOnLeave/);
assert.match(ui,/surveillance-live-motion-sensitivity/);
assert.match(app,/navigation\?\.type === 'reload'/);
assert.match(app,/\? saved : 'overview'/);
assert.match(html,/<section class="page active" id="page-overview">/);
assert.match(html,/<section class="page" id="page-map">/);
console.log('Surveillance tabs, live motion controls, and Overview first-launch checks passed');
