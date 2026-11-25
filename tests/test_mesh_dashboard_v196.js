const assert=require('node:assert/strict');
const {mapNodes}=require('../openrf/static/mesh-dashboard.js');
const r={protocol:'MeshCore',infrastructure:true,position:{latitude:38,longitude:-120}};
const c={protocol:'MeshCore',infrastructure:false,position:null};
assert.deepEqual(mapNodes([r,c],new Set(['MeshCore','infrastructure'])),[r]);
assert.deepEqual(mapNodes([r,c],new Set(['infrastructure'])),[r]);
assert.deepEqual(mapNodes([r,c],new Set(['Meshtastic'])),[]);
