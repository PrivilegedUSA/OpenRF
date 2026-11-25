const assert=require('node:assert/strict');
const {filterNodes,mapNodes}=require('../openrf/static/mesh-dashboard.js');
const cached={protocol:'Reticulum',id:'abc',name:'Friend',source:'RNS_PATH_CACHE',quality:'Cached path',position:null};
assert.deepEqual(filterNodes([cached],'cached','unlocated','name'),[cached]);
assert.deepEqual(mapNodes([cached],new Set(['Reticulum'])),[]);
console.log('Reticulum cache filtering and map exclusion passed');
