'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const script=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['map-route-choices','route-choice-standard','route-choice-alternate','route-choice-close',
'route-choice-settings','route-avoid-highways','route-avoid-tolls','route-road-find','route-road-matches',
'route-road-pick','route-road-add','route-road-scope','route-road-list'])
 assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`unique ${id}`);
assert(script.includes("$('route-avoid-settings').insertBefore($('map-camera-route-panel'),$('route-road-control'))"),'camera preferences live beside highways and tolls');
assert(script.includes('renderRouteChoices();renderNavigationOverlay();'),'route choice also redraws map');
assert(script.includes('class="alternate-route"'),'renders visually distinct alternative');
assert(script.includes('class="route-hit"'),'drawn route is selectable');
assert(script.includes("options:routeRequestOptions()"),'preferences apply to local route and comparison');
assert(script.includes('navAvoidSaved') && script.includes('navAvoidSession'),'separate trip/saved exclusions');
assert(script.includes('routeAvoidEntries().length>=8'),'bounds road exclusions');
assert(script.includes('window.localStorage'),'saved road points stay browser-local');
assert(css.includes('#page-map #map-camera-route-chip{display:none!important}'),'no overlapping old route chip');
assert(css.includes('navigation-driving .map-route-choices{display:none!important}'),'hide selection during live navigation');
console.log('PASS v0.2.76 route choices, map lines, preferences and saved/temporary road exclusions');
