const assert=require('node:assert/strict');
const {topologyRows}=require('../openrf/static/mesh-dashboard.js');
assert.equal(topologyRows([{via_name:'Repeater',destination_name:'Alice'}],'alice').length,1);
assert.equal(topologyRows([{via_name:'Repeater'}],'missing').length,0);
assert.equal(topologyRows(Array.from({length:120},()=>({via_name:'x'})),'').length,100);
