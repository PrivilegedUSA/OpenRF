'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {bounds,pointFeatures,coverageFeatures,rasterPath}=require('../openrf/static/cellular-map.js');
assert.deepEqual(bounds(-200,-100,200,100),[-180,-90,180,90]);
assert.deepEqual(bounds(170,-10,190,10),[170,-10,-170,10]);
const pts=pointFeatures([{kind:'towers',lon:-120,lat:38},{kind:'estimates',lon:-121,lat:39}]);assert.equal(pts.features.length,2);assert.equal(pts.features[1].properties.kind,'estimates');
const poly=[[[0,0],[2,0],[2,2],[0,0]],[[1,1],[1.2,1],[1.2,1.2],[1,1]]];assert.deepEqual(coverageFeatures([{carrier:'att',pack:'a',polygon:poly}]).features[0].geometry.coordinates,poly);
assert.equal((rasterPath(poly,(x,y)=>({x,y})).match(/ Z/g)||[]).length,2);
const read=f=>fs.readFileSync('openrf/static/'+f,'utf8');assert.match(read('app.js'),/OpenRFCellular\?\.vector\(state.map,true\)/);assert.match(read('app.js'),/OpenRFCellular\?\.raster\(nextPins,raster,width,height,worldPixel,pixelWorld\)/);assert.match(read('index.html'),/data-cellular-kind="estimates"/);assert.match(read('index.html'),/data-cellular-carrier="verizon"/);assert.match(read('cellular-map.js'),/fill-rule','evenodd'/);assert.match(read('cellular-map.js'),/snapButton/);console.log('Cellular reference layers passed');
