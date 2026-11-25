const assert=require('node:assert/strict');
const {historySeries}=require('../openrf/static/mesh-dashboard.js');
assert.deepEqual(historySeries([{captured:3,telemetry:{x:0}},{captured:2,telemetry:{}},{captured:1,telemetry:{x:-90}}],'x'),[[1,-90],[3,0]]);
console.log('PASS history series order and missing telemetry');
