const assert=require('node:assert/strict');
const {healthLines}=require('../openrf/static/mesh-dashboard.js');
assert.deepEqual(healthLines(null),['Inventory statistics unavailable']);
const lines=healthLines({recent:0,stale:1,age_unknown:2,located:0,infrastructure:0,expired_paths:0,telemetry:{'RSSI (dBm)':null,'Battery (%)':{minimum:0,maximum:0,mean:0,samples:1}}});
assert(lines[0].includes('Unknown: 2'));assert(lines.includes('RSSI (dBm): Unavailable'));assert(lines.some(x=>x.includes('mean 0.0')));
console.log('PASS health display');
