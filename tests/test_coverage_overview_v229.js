'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {coverageFeatures}=require('../openrf/static/cellular-map.js');
const polygon=[[[0,0],[1,0],[1,1],[0,1],[0,0]]];
const features=coverageFeatures([{carrier:'att',pack:'raw',polygon},{carrier:'verizon',pack:'FCC overview',polygon,overview:true,opacity:0.10}]).features;
assert.equal(features[0].properties.opacity,0.24);assert.equal(features[1].properties.opacity,0.10);assert.equal(features[1].properties.carrier,'verizon');
const src=fs.readFileSync('openrf/static/cellular-map.js','utf8');assert.match(src,/coarse cells contain reports, not full-cell coverage/);assert.match(src,/overviewPaths/);assert.match(src,/\['coalesce',\['get','opacity'\],0.24\]/);
console.log('Coverage overview renderer and provenance labels passed');
