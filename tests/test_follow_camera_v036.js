'use strict';
// Real code interaction: estimated ±107-m desktop position follows the planned
// geometry visually, never claims a measured heading or live maneuver timing.
const fs=require('node:fs'), assert=require('node:assert/strict');
const guide=require('../openrf/static/route_guidance.js');
const src=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
assert(html.includes('id="map-follow-camera-note"'));
assert(css.includes('.map-follow-camera-note'));
assert(src.includes("state.map.on('dragstart'"),'manual map drag must suspend camera following');
assert(src.includes('state.navFollowCameraSuspended=false;'),'crosshair must be able to resume follow');
assert(src.includes("'map-follow-camera-note'"));
assert(src.includes("Camera is aligned with the START of the planned route"),'immediate perspective is labelled route, not live position');
const road={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[[-120.60,38.40],[-120.599,38.40],[-120.598,38.40],[-120.598,38.401]],
 maneuvers:[{instruction:'Depart Main Street',shape_index:0},{instruction:'Turn left onto Oak Street',shape_index:3}]};
const heading=guide.routeVisualHeading(road,-120.6,38.4,0);
assert(heading && heading.offset_m<2 && heading.heading>70 && heading.heading<110);
assert.equal(guide.routeVisualHeading(road,-120.6,38.4,0).heading,heading.heading);
const nearTurn=guide.routeVisualHeading(road,-120.598,38.4009,0);
assert(nearTurn && Number.isFinite(nearTurn.heading));
const beg=src.indexOf('function navigationNearestShape(');
const end=src.indexOf("$('map-begin-guidance').addEventListener('click'",beg);
assert(beg>0&&end>beg);
const els={'map':{clientHeight:480},'map-follow-instruction':{textContent:''},'map-follow-distance':{textContent:''},
 'map-follow-quality':{textContent:''},'map-follow-camera-note':{textContent:''},
 'map-follow-planned':{textContent:'',hidden:false},'map-follow-hud':{classList:{toggle(){},remove(){}}}};
const frames=[];const st={navFollowId:3,navPreview:road,navFollowLast:0,navFollowProgress:0,navGnssLast:0,
 navFollowCameraSuspended:false,mapReady:true,map:{easeTo(opts){frames.push(opts)}},rasterMap:null};
const update=()=>{};
const {followPosition}=Function('state','$','routeGuide','updateBrowserLocationMarker','stopNavigationFollow',
 'function renderNavigationLanes(){};function navigationSilence(){};function navigationSpeak(){return false;}\n'+src.slice(beg,end)+'; return {followPosition};')(st,id=>els[id],guide,update,()=>{});
const reading=()=>({timestamp:Date.now(),coords:{latitude:38.4,longitude:-120.60,accuracy:107}});
followPosition(reading());
assert.equal(frames.length,1);
assert.equal(frames[0].pitch,42);
assert.equal(frames[0].zoom,15.25);
assert(frames[0].offset[1]>0,'real marker displayed toward bottom');
assert.match(els['map-follow-camera-note'].textContent,/planned road, NOT your actual driving heading/);
assert.match(els['map-follow-instruction'].textContent,/^Planned: Depart Main Street/);
assert.match(els['map-follow-distance'].textContent,/Approximate location.*LIVE turn timing paused/);
assert.equal(els['map-follow-planned'].hidden,false);
st.navFollowCameraSuspended=true;st.navFollowLast=0;
followPosition(reading());
assert.equal(frames.length,1,'dragging map must not snap back to follow');
st.navFollowCameraSuspended=false;st.navFollowLast=0;
followPosition(reading());
assert.equal(frames.length,2,'resuming follow repositions the camera');
st.navFollowLast=0;
followPosition({timestamp:Date.now(),origin:'gpsd',coords:{latitude:38.4,longitude:-120.6,accuracy:8,heading:180,speed:6}});
assert.equal(frames.at(-1).pitch,48);
assert.equal(frames.at(-1).bearing,180,'measured moving heading takes priority over planned road');
assert.match(els['map-follow-camera-note'].textContent,/measured moving heading/);
console.log('v0.2.36 route-aligned desktop follow, manual-pan suspension, and measured-heading priority passed');
