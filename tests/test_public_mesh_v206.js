'use strict';
const assert=require('node:assert/strict');
const {groups,selected}=require('../openrf/static/public-mesh.js');
const nodes=[{role:'Repeater',x:12,y:10},{role:'Client',x:30,y:20},{role:'Client',x:55,y:55},{role:'Client',x:-10,y:20}];
assert.equal(selected(nodes,true,true).length,4);assert.equal(selected(nodes,false,true).length,1);assert.equal(selected(nodes,false,false).length,0);
const g=groups(nodes,n=>n,100,100);assert.equal(g.length,2);assert.equal(g[0].nodes.length,2);assert.equal(g[0].x,21);assert.equal(g.reduce((s,g)=>s+g.nodes.length,0),3);
const dense=groups(Array.from({length:100000},()=>({x:1,y:1})),n=>n,1280,800);assert.equal(dense.length,1);assert.equal(dense[0].nodes.length,100000);
console.log('PASS public directory filtering and bounded screen clustering');
