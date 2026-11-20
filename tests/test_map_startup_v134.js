'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/app.js','utf8');

assert.match(html, /<div id="map-directions-actions" class="map-directions-actions"/,
  'directions actions must have the ID used by the app');
for(const id of ['map-directions-review','map-directions-summary','map-directions-actions','map-directions-start','map-directions-intro','map-route-action-text']){
  assert(html.includes(`id="${id}"`),`missing startup/route node: ${id}`);
}
assert(js.includes('if(node)directionsResizeObserver.observe(node);'),
  'missing optional DOM elements cannot crash the app during resize observer setup');
assert(!/\.observe\(\$\('map-directions-actions'\)\)/.test(js),
  'never pass potentially null lookup to ResizeObserver.observe');
assert(js.includes('showPage(rememberedPage());'), 'initial page selection preserved');
console.log('PASS v0.2.147 map startup contract and guarded resize observer');
