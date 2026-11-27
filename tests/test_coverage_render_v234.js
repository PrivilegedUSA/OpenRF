'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {stripeCarriers,stripeImage,vectorStripes,coverageFeatures}=require('../openrf/static/cellular-map.js');
const carriers=stripeCarriers([{carrier:'verizon'},{carrier:'att'},{carrier:'tmobile'},{carrier:'att'}]);
assert.deepEqual(carriers,['att','tmobile','verizon']);
for(const selection of [carriers,carriers.slice(0,2),[...carriers,'other','aggregate']]){
  const images=selection.map(c=>stripeImage(c,selection));
  for(let i=3;i<images[0].data.length;i+=4)assert.equal(images.reduce((sum,img)=>sum+img.data[i],0),255,'bands partition every pixel');
  assert.ok(images.every(img=>img.data.some((v,i)=>i%4===3&&v===255)));
}
const images=new Map(),map={hasImage:id=>images.has(id),addImage:(id,image)=>images.set(id,image)};
assert.equal(vectorStripes(map,['att']),null);assert.equal(images.size,0);
const expr=vectorStripes(map,carriers);assert.equal(expr[0],'match');assert.equal(images.size,3);
assert.deepEqual(vectorStripes(map,carriers),expr);assert.equal(images.size,3);
const p={carrier:'att',pack:'FCC overview',polygon:[[[0,0],[1,0],[0,1],[0,0]]],overview:true,opacity:0.018};
assert.deepEqual(coverageFeatures([p]).features[0].properties,{carrier:'att',pack:'FCC overview',overview:true,opacity:0.018});
const src=fs.readFileSync('openrf/static/cellular-map.js','utf8');assert.match(src,/fill-outline-color.*rgba\(0,0,0,0\)/);assert.match(src,/rasterStripes\(svg,stripeCarriers\(data.coverage\)\)/);assert.match(src,/Striped colors show separate carrier footprints/);
console.log('Coverage density and disjoint carrier band rendering passed');
