'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
(async()=>{
 const elements=new Map(), timers=new Map();let timerID=0, start, finish, requestCount=0, fail=false;
 function element(id){if(!elements.has(id)) elements.set(id,{hidden:true,checked:false,disabled:false,value:0,textContent:'',events:{},addEventListener(k,fn){this.events[k]=fn;},removeAttribute(k){delete this[k];},replaceChildren(){}});return elements.get(id);}
 const context={document:{getElementById:element,addEventListener(k,fn){start=fn;}},window:{},setTimeout(fn){const id=++timerID;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},fetch:async(url)=>{
  if(url.endsWith('/status')) {requestCount++;return {ok:true,json:async()=>({phase:'downloading',received_bytes:10*1048576,total_bytes:20*1048576})};}
  if(url.endsWith('/refresh')) return new Promise(r=>{finish=()=>r(fail?{ok:false,json:async()=>({error:'No valid geographic records'})}:{ok:true,json:async()=>({state:'cached',nodes:[],cached_count:0,downloaded_at:1})});});
  return {ok:true,json:async()=>({state:'empty',nodes:[],cached_count:0})};
 }};
 vm.runInNewContext(fs.readFileSync('openrf/static/public-mesh.js','utf8'),context);
 start();await new Promise(r=>setImmediate(r));
 const action=element('public-mesh-download').events.click();
 assert.equal(element('public-mesh-download').disabled,true);
 assert.match(element('public-mesh-progress-text').textContent,/Connecting/);
 const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();
 assert.equal(element('public-mesh-progress').value,50);assert.match(element('public-mesh-progress-text').textContent,/10\.0 MiB \/ 20\.0 MiB · 50%/);
 assert.equal(requestCount,1);finish();await action;await new Promise(r=>setImmediate(r));
 assert.equal(element('public-mesh-progress').value,100);assert.equal(element('public-mesh-download').disabled,false);assert.equal(timers.size,0);
 fail=true;const failed=element('public-mesh-download').events.click();finish();await failed;
 assert.equal(element('public-mesh-progress').hidden,true);assert.equal(element('public-mesh-progress').value,0);assert.match(element('public-mesh-progress-text').textContent,/No valid geographic records/);assert.equal(timers.size,0);assert.equal(element('public-mesh-download').disabled,false);
 fail=false;const retry=element('public-mesh-download').events.click();assert.equal(element('public-mesh-progress').hidden,false);finish();await retry;assert.equal(element('public-mesh-progress').value,100);assert.equal(timers.size,0);
 console.log('PASS public mesh download byte progress, failed terminal state, retry and polling lifecycle');
})().catch(e=>{console.error(e);process.exitCode=1;});
