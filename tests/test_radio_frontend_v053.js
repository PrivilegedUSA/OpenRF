'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('openrf/static/index.html','utf8');
const script = fs.readFileSync('openrf/static/radio.js','utf8');
const api = fs.readFileSync('openrf/server.py','utf8');
const css = fs.readFileSync('openrf/static/app.css','utf8');
assert(html.includes('data-page="radio"'));
assert(html.includes('id="page-radio"'));
assert(html.includes('/static/radio.js?v=0.2.76'));
for (const id of ['radio-frequency','radio-mode','radio-duration','radio-start','radio-stop','radio-refresh','radio-player','radio-playback','radio-state']) {
 assert(html.includes(`id="${id}"`), id);
}
assert(script.includes("'/api/radio/start'"));
assert(script.includes("'/api/radio/stop'"));
assert(script.includes("'/api/radio/status'"));
assert(script.includes('audio/${encodeURIComponent(record.id)}.wav'));
assert(!/getUserMedia|speechRecognition|\bptt\b/i.test(script));
assert(api.includes("'/static/radio.js'"));
assert(css.includes('/* v0.2.53: receive-only tuner. No changes to map layouts. */'));
assert(html.includes('/static/app.css?v=0.2.163'));
console.log('PASS v0.2.53 radio controls and read-only local audio wiring');
