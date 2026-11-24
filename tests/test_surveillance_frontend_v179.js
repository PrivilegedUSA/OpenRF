/* Source integration checks for the user-controlled, two-feed monitoring wall. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('openrf/static/index.html','utf8');
const ui = fs.readFileSync('openrf/static/surveillance.js','utf8');
const css = fs.readFileSync('openrf/static/surveillance.css','utf8');
assert.match(html, /id="surveillance-live-grid"/);
assert.match(html, /id="surveillance-viewer"/);
assert.match(html, /id="surveillance-close-live"/);
assert.match(ui, /const MAX_LIVE = 2;/);
assert.match(ui, /live\.size >= MAX_LIVE/);
assert.match(ui, /live\.set\(camera\.id, pane\)/);
assert.match(ui, /stopView\(camera\.id\)/);
assert.match(ui, /image\.removeAttribute|querySelector\('img'\)\.removeAttribute\('src'\)/);
assert.match(ui, /toggleFullscreen\(pane\)/);
assert.match(ui, /document\.exitFullscreen/);
assert.match(ui, /openrf:surveillance-hidden/);
assert.match(ui, /pagehide/);
assert.match(ui, /Previewing is separate from recording|No recording starts automatically/);
assert.match(ui, /escapeHtml/);
assert.doesNotMatch(ui, /localStorage/); // Polls only requested live-motion status, not camera streams.
assert.match(css, /surveillance-live-grid/);
console.log('Surveillance two-feed monitoring wall integration checks passed');
