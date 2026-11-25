'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const els=new Map(),calls=[];let boot;const make=()=>({checked:false,hidden:true,disabled:false,style:{},dataset:{},events:{},children:[],textContent:'',setAttribute(){},removeAttribute(k){delete this[k]},addEventListener(k,f){this.events[k]=f},replaceChildren(...x){this.children=x},append(...x){this.children.push(...x)}});const el=id=>{if(!els.has(id))els.set(id,make());return els.get(id)};
 let ret={state:'cached',cached_count:1,downloaded_at:1,unmapped:2,nodes:[{name:'Fixture gateway',id:'a',role:'Repeater',lat:50,lon:50}]};const empty={state:'empty',nodes:[],cached_count:0};
 const context={document:{getElementById:el,createElement:make,addEventListener(k,f){boot=f}},window:{confirm:()=>true},setTimeout,clearTimeout,fetch:async(url,opts)=>{calls.push([url,opts?.method]);if(url.endsWith('/reticulum/clear'))ret=empty;return {ok:true,json:async()=>url.includes('/reticulum')?ret:empty}}};
 vm.runInNewContext(fs.readFileSync('openrf/static/public-mesh.js','utf8'),context);boot();await new Promise(r=>setImmediate(r));assert.equal(calls.filter(c=>c[1]==='POST').length,0);assert.match(el('public-reticulum-status').textContent,/2 inferred/);
 el('public-reticulum-repeaters').checked=true;const raster=()=>{let p=make();context.window.OpenRFPublicMesh.raster(p,{center:[50,50],zoom:2},100,100,(x,y)=>[x,y]);return p.children};assert.equal(raster()[0].textContent,'R+');assert.equal(raster()[0].dataset.network,'Reticulum');await el('public-reticulum-clear').events.click();await new Promise(r=>setImmediate(r));assert.equal(raster().length,0);assert(calls.some(c=>c[0]==='/api/mesh/public/reticulum/clear'&&c[1]==='POST'));
 console.log('PASS public Reticulum layer and independent cache controls');
})().catch(e=>{console.error(e);process.exitCode=1});
