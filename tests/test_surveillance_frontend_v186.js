/* v0.2.186: one on-entry camera wall, opt-in recording and usable fullscreen controls. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const ui = fs.readFileSync('openrf/static/surveillance.js', 'utf8');
const css = fs.readFileSync('openrf/static/surveillance.css', 'utf8');
const app = fs.readFileSync('openrf/static/app.js', 'utf8');
const overview = html.indexOf('id="surveillance-panel-overview"');
const cameras = html.indexOf('id="surveillance-panel-cameras"');
const recordings = html.indexOf('id="surveillance-panel-recordings"');
const liveGrid = html.indexOf('id="surveillance-live-grid"');
const managementGrid = html.indexOf('id="surveillance-grid"');
assert(overview >= 0 && overview < liveGrid && liveGrid < cameras);
assert(cameras < managementGrid && managementGrid < recordings);
assert.match(html, /id="surveillance-close-live">Pause all previews/);
assert.match(html, /id="surveillance-fullscreen" hidden>Expand grid/);
assert.match(ui, /surveillance-fullscreen.*hidden = live.size < 2/);
assert.match(html, /What does “Motion clips” do/);
assert.match(ui, /const MAX_LIVE = 2;/);
assert.match(ui, /function overviewVisible\(\)/);
assert.match(ui, /activeTab === 'overview' && \$\('page-surveillance'\)\.classList\.contains\('active'\)/);
assert.match(ui, /function autoStartPreviews\(\)/);
assert.match(ui, /if \(!overviewVisible\(\) \|\| autoPreviewInitialized\) return;/);
assert.match(ui, /for \(const camera of cameras\) \{\s*if \(live.size >= MAX_LIVE\) break;/);
assert.match(ui, /if \(!paused\.has\(camera\.id\) && !live\.has\(camera\.id\)\) view\(camera\)/);
assert.match(ui, /if \(live.size >= MAX_LIVE\)/);
assert.match(ui, /live\.set\(camera\.id, pane\)/);
assert.match(ui, /pane\.querySelector\('img'\)\.removeAttribute\('src'\)/);
assert.match(ui, /if \(activeTab === 'overview' && tab !== 'overview'\) stopView\(\)/);
assert.match(ui, /openrf:surveillance-hidden/);
assert.match(ui, /document\.fullscreenElement === target/);
assert.match(ui, /document\.exitFullscreen/);
assert.match(ui, /fullscreenchange/);
for (const control of ['data-feed-fullscreen','data-feed-record','data-feed-snapshot','data-feed-view','data-feed-motion']) {
  assert.match(ui, new RegExp(control));
}
assert.match(ui, /camera\.type === 'USB' \? 'USB \(V4L2\)' : 'RTSP'/);
assert.match(ui, /function toggleRecording\(/);
assert.match(ui, /function captureSnapshot\(/);
assert.match(ui, /function toggleMotion\(/);
// No recording or motion starts as a side effect of simply drawing the camera wall.
const automatic = ui.slice(ui.indexOf('function autoStartPreviews()'), ui.indexOf('function showInventory()'));
assert.doesNotMatch(automatic, /toggleRecording\(|toggleMotion\(|captureSnapshot\(|\/record`|\/snapshot`/);
assert.match(css, /surveillance-feed:fullscreen \.surveillance-feed-media/);
assert.match(css, /surveillance-feed-controls/);
assert.match(app, /\? saved : 'overview'/);
console.log('Surveillance v186 preview wall, fullscreen actions, safe on-entry preview and controls passed');
