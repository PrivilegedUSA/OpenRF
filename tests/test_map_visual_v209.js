'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../openrf/static',f),'utf8');
const css=read('app.css'),cameras=read('camera-layers.js'),mesh=read('public-mesh.js'),html=read('index.html');
for(const [type,cls,color] of [['ALPR','camera-alpr','#ee7828'],['RED_LIGHT','camera-red','#d82f49'],['SPEED','camera-speed','#e4bf28']]){
 assert.ok(cameras.includes(`${type}:'${color}'`));assert.ok(css.includes(`.layer-dot.${cls}{background:${color}}`));
}
assert.ok(css.includes('.camera-key.alpr{color:#ee7828}.camera-key.red-light{color:#d82f49}.camera-key.speed{color:#e4bf28}'));
assert.ok(cameras.includes("'circle-radius':6,'circle-stroke-width':0"));
assert.ok(mesh.includes("dismiss.className='map-sheet-close'"));assert.ok(mesh.includes("dismiss.setAttribute('aria-label','Close public mesh node details')"));
assert.ok(mesh.includes('head.append(title,dismiss)'));assert.ok(mesh.includes('p.replaceChildren(head,body)'));
assert.ok(css.includes('#page-map button:focus-visible'));assert.ok(css.includes('mask:url("data:image/svg+xml'));
assert.ok(html.includes('mesh-layer-dot repeater'));assert.ok(css.includes('#page-map .public-mesh-pin[data-kind="cluster"]'));
console.log('PASS map styling, camera palette parity, accessible close and focus contracts');
