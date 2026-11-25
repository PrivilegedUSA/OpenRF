const assert=require('node:assert/strict');
const {filterNodes,mapNodes}=require('../openrf/static/mesh-dashboard.js');
const a={name:'Radio',id:'a',protocol:'Meshtastic',position:{latitude:38,longitude:-120},infrastructure:true,last_heard:100};
const b={name:'Contact',id:'b',protocol:'Reticulum',position:null};
assert.deepEqual(filterNodes([a,b],'','unlocated','name'),[b]);
assert.deepEqual(filterNodes([a,b],'radio','all','recent'),[a]);
assert.deepEqual(mapNodes([a,b],new Set(['infrastructure','Meshtastic'])),[a]);
assert.deepEqual(mapNodes([a,b],new Set(['Reticulum'])),[]);
assert.deepEqual(mapNodes([a,b],new Set()),[]);
