'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['map-camera-route-chip','map-camera-route-panel','map-camera-route-enable',
 'map-camera-route-close','map-search-camera-options','map-search-camera-choice',
 'map-picked-camera-options','map-follow-camera-options','map-compare-camera-routes',
 'map-use-camera-alternate']){
 assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`unique ${id}`);
}
const directionsStart=html.indexOf('<details id="map-directions-review"');
const directionsEnd=html.indexOf('</details>',directionsStart);
assert(directionsStart>0 && directionsEnd>0);
assert(!html.slice(directionsStart,directionsEnd).includes('id="map-camera-route-panel"'),
 'route options are no longer nested in the hidden turn-by-turn list');
assert(html.indexOf('id="map-camera-route-panel"')>directionsEnd);
assert(html.indexOf('id="map-camera-route-panel"')<html.indexOf('id="map-follow-hud"'));
assert(html.includes('id="map-camera-route-enable"'), 'route preference is explicit opt-in');
assert(app.includes('compareVisibleCameraRoutes(road,selectedRouteCameraTypes())'),'opted-in directions automatically compare');
assert(app.includes('cameraPanelVisibility(true)'),'after planning camera options can be opened');
assert(app.includes('if(state.navFollowId!==null){'),'cannot replace active route with a manual alternative');
assert(app.includes('state.navCameraAvoidTypes=enabled?[...chosen]:null'),
 'conservative off-route recalculation uses selected explicit preferences');
assert(app.includes('if(!better)status.textContent'), 'no invitation to choose a non-improving alternative');
assert(css.includes('#page-map #map-camera-route-panel') && css.includes('#page-map.navigation-driving #map-camera-route-panel'));
console.log('PASS v0.2.74 route option visibility, opt-in, alternative safety and GPS recalculation integration');
