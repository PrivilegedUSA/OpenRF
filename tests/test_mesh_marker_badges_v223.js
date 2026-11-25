'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('openrf/static/public-mesh.js','utf8');
const start=src.indexOf('  const networkOrder='), end=src.indexOf('  function layout(');
const make=(tag,value)=>({tag,textContent:value,dataset:{},children:[],append(...nodes){this.children.push(...nodes)},setAttribute(k,v){this[k]=v},addEventListener(){}});
const context={text:make,network:g=>new Set(g.nodes.map(n=>n.network)).size===1?g.nodes[0].network:'Mixed'};
vm.runInNewContext(src.slice(start,end)+src.slice(src.indexOf('  function marker('),src.indexOf('  function clearMarkers('))+'\nthis.marker=marker;',context);
for(const [network,letter] of [['MeshCore','C'],['Meshtastic','M'],['Reticulum','R']]){
 const n={network,name:'fixture',role:'Repeater'};
 const single=context.marker({nodes:[n]});assert.equal(single.textContent,letter);assert.equal(single.dataset.kind,'repeater');assert.equal(single.dataset.count,undefined);assert.match(single.title,/Repeater/);
 for(const count of [2,12,99,100,1000]){
  const pin=context.marker({nodes:Array.from({length:count},()=>n)},true);
  assert.equal(pin.textContent,letter);assert.equal(pin.dataset.kind,'cluster');assert.equal(pin.dataset.count,count>99?'99+':String(count));assert.match(pin['aria-label'],new RegExp(`^${count} public ${network}`));assert.match(pin.className,/raster/);
 }
}
const mixed=context.marker({nodes:[{network:'MeshCore'},{network:'MeshCore'},{network:'Meshtastic'},{network:'Reticulum'}]});
assert.deepEqual(mixed.children.map(n=>n.textContent),['C','M','R']);assert.equal(mixed.dataset.count,'4');assert.match(mixed.title,/MeshCore: 2/);
const css=fs.readFileSync('openrf/static/app.css','utf8');assert.match(css,/data-count\]::after\s*\{[^}]+content:attr\(data-count\);position:absolute;top:-6px;right:-5px/);
console.log('PASS network initials, infrastructure shapes, individual and mixed cluster count badges with full accessible counts');
