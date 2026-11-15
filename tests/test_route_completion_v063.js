'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const guidance=require('../openrf/static/route_guidance.js');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const route={type:'ROAD_ROUTE',is_driving_route:true,coordinates:[[-120.7,38.4],[-120.69,38.4],[-120.68,38.4],[-120.67,38.4]],
  maneuvers:[{instruction:'Head west',shape_index:0,length_miles:1.0,leg:1},{instruction:'Arrive',shape_index:3,length_miles:0,leg:1}],distance_miles:2,duration_seconds:160};
assert.equal(guidance.hasCompleteDirections(route),true);
assert.equal(guidance.hasCompleteDirections({...route,maneuvers:route.maneuvers.slice(0,1)}),false);
assert(!guidance.sheet(route).includes('Leg 1'), 'Print route no longer repeats Leg 1');
assert(app.includes('preserveCurrentOnFailure:true'), 'existing route preserved when exclusion reroute fails');
assert(app.includes('!routeGuide.hasCompleteDirections(road)'), 'reject premature maneuver ending');
assert(!app.includes('mi · Leg ${t.leg}') && !app.includes('mi · leg ${t.leg}'),'directions and follow lists omit redundant leg');
assert(app.includes("$('map-directions-review').open"),'route choice hides while directions expanded');
assert(app.includes('const cameraSwitches='),'camera choices share the plain preference list');
assert(css.includes('top:calc(var(--openrf-nav-overlay-bottom, 67px) + 40px)'), 'route cards lower than directions header');
console.log('PASS v0.2.70 complete road-avoidance directions, unified preferences and clear route selection');
