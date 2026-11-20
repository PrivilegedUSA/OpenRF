'use strict';
// v0.2.149: compact map destination actions, clear menu labels and radio spacing.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');

const popup=html.match(/<aside id="map-picked-action"[\s\S]*?<\/aside>/)?.[0];
assert(popup,'Destination selected popup stays intact');
const route=popup.indexOf('id="map-picked-route"');
const origin=popup.indexOf('id="map-picked-origin"');
const dest=popup.indexOf('id="map-picked-change"');
const start=popup.indexOf('id="map-picked-begin"');
assert(route>=0 && origin>route && dest>origin && start>dest,
  'Destination actions display full-width directions, then start/destination choices');
assert.match(popup, /id="map-picked-change"[^>]*>Change destination<\/button>/);
assert.match(css, /#page-map \.map-picked-buttons\{margin-top:12px/);
assert.match(css, /#page-map #map-picked-route\{grid-column:1 \/ -1/);
assert.match(css, /#page-map #map-picked-origin\{grid-column:1\}/);
assert.match(css, /#page-map #map-picked-change\{grid-column:2\}/);
assert.match(css, /#page-map :is\(#map-picked-begin,#map-picked-camera-options\)\{grid-column:1 \/ -1\}/);
assert(html.includes('id="map-picked-camera-options"'),'Driving preferences remain available');

assert.match(html, /<div class="panel radio-setup-panel"><h3>Linux receiver setup/);
assert.match(css, /#page-radio \.radio-setup-panel\{margin-top:18px\}/);
assert.match(html, /data-page="spectrum" aria-label="Signal viewer: spectrum and waterfall"/);
assert.match(html, /<span class="nav-label">Signal Viewer<\/span>/);
assert.match(html, /<h2>Spectrum &amp; waterfall<\/h2>/,'Technical page title still explains spectrum and waterfall');
assert.match(html, /data-jump="spectrum" type="button">Open Signal Viewer<\/button>/);
assert.match(app, /spectrum:'Spectrum & Waterfall'/);

const nav=html.match(/<button class="nav-btn" data-page="emergency">([\s\S]*?)<span class="nav-label">Emergency<\/span><\/button>/)?.[1];
const header=html.match(/id="header-emergency-shortcut"([\s\S]*?)<\/svg><\/button>/)?.[1];
assert(nav && header,'Emergency has a header and sidebar icon');
for(const segment of ['M12 2.5 22 20H2L12 2.5Z','M12 8.5v5.5','cx="12" cy="17"']){
  assert(nav.includes(segment) && header.includes(segment),`Same warning triangle in sidebar and header: ${segment}`);
}
assert.match(css, /\.sidebar \.nav-btn\[data-page="emergency"\] \.nav-icon svg/);
assert.match(html, /FIELD CONSOLE · 0\.2\.156/);
console.log('PASS v0.2.149 destination action rows and padding, radio spacing, Signal Viewer, warning icon');
