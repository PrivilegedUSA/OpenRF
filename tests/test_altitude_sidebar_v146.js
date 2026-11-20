'use strict';
// v0.2.149 desktop map layout: altitude floats with the map and an always-open
// desktop sidebar must not pretend that its X button can close it.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const elevation=fs.readFileSync('openrf/static/map-elevation.js','utf8');

const headerEnd=html.indexOf('</header>');
const mapStart=html.indexOf('<div class="map-wrap">');
const destination=html.indexOf('id="map-destination-panel"');
const badge=html.indexOf('id="map-altimeter"');
assert(headerEnd>0 && mapStart>headerEnd && badge>mapStart && badge<destination,
  'The single GPS altitude badge must live inside the map viewport, not the header');
assert.equal((html.match(/id="map-altimeter"/g)||[]).length,1,
  'Keep only one altitude node so the existing GPS display controller updates it');
assert(html.includes('id="map-altimeter-value"'));
assert(elevation.includes('map-altimeter-value'),
  'Real GPS/vertical-accuracy guard must remain wired to the moved badge');
assert.match(css,/#page-map \.map-wrap > \.map-altimeter\s*\{[^}]*position:absolute;[^}]*right:12px;[^}]*bottom:59px;/s,
  'Altitude overlay should sit above the right-hand map action cluster');
assert.match(css,/#page-map \.map-wrap > \.map-altimeter\s*\{[^}]*pointer-events:auto;/s,
  'Altitude tooltip should remain available on the overlay');
assert.match(css,/\.sidebar \.menu-close\{display:none!important\}/,
  'Permanent sidebar must not show an inert close button');
assert.match(css,/@media\(max-width:900px\), \(max-width:1400px\) and \(max-height:850px\) and \(pointer:coarse\)\{\s*\.sidebar \.menu-close\{display:grid!important\}/,
  'Touch/compact drawer must retain a usable sidebar close button');
assert(html.includes('id="menu-close"'),'Keep the drawer close action for small screens');
assert(!html.slice(0,headerEnd).includes('id="map-altimeter"'));
console.log('PASS v0.2.149 map altitude overlay and responsive sidebar close behavior');
