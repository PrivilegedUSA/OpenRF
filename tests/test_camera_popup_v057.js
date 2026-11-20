'use strict';
/* v0.2.59 source contract for dark camera report popups. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'openrf/static/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'openrf/static/camera-layers.js'),'utf8');
const css=fs.readFileSync(path.join(root,'openrf/static/app.css'),'utf8');
assert(html.includes('/static/app.css?v=0.2.156'));
assert(html.includes('/static/camera-layers.js?v=0.2.114'));
assert(js.includes("className:'openrf-camera-map-popup'"));
assert(js.includes('setDOMContent(div)')); // data is assembled as safe text nodes
assert(css.includes('#page-map #map .openrf-camera-map-popup .maplibregl-popup-content'));
assert(css.includes('background:#102a34'));
assert(css.includes('color:#e8f6f5'));
assert(css.includes('.maplibregl-popup-close-button'));
assert(css.includes('.maplibregl-popup-tip'));
assert(css.includes('max-height:min(57dvh,310px)'));
console.log('PASS dark camera popup with readable text, source link and mobile scrolling');
