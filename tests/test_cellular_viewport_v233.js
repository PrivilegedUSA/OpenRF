'use strict';
const assert=require('node:assert/strict');
const {viewportLoader}=require('../openrf/static/cellular-map.js');
function harness(){
  let timer=null,requests=[],success=[],failure=[],restored=0;
  const loader=viewportLoader({load:key=>new Promise((resolve,reject)=>requests.push({key,resolve,reject})),onLoading:()=>{},onSuccess:data=>success.push(data),onFailure:(e,retry)=>failure.push([e.message,retry]),onRestored:()=>restored++,setTimer:(fn,delay)=>{assert.equal(timer,null);timer={fn,delay};return timer;},clearTimer:()=>{timer=null;}});
  return {loader,requests,success,failure,get restored(){return restored;},get delay(){return timer?.delay;},tick(){assert.ok(timer);const {fn}=timer;timer=null;return fn();}};
}
(async()=>{
  const h=harness(),l=h.loader;
  l.request('local');const local=h.tick();h.requests[0].resolve('local polygons');await local;
  l.request('state');const state=h.tick();l.request('region');l.request('country');assert.equal(h.requests.length,2);assert.equal(h.delay,undefined);
  h.requests[1].resolve('stale state polygons');await state;assert.deepEqual(h.success,['local polygons']);
  const country=h.tick();assert.equal(h.requests[2].key,'country');h.requests[2].reject(Error('503'));await country;
  assert.deepEqual(h.success,['local polygons']);assert.deepEqual(h.failure,[['503',true]]);assert.equal(h.delay,1000);
  l.request('country');assert.equal(h.delay,1000);const retry=h.tick();h.requests[3].resolve('country overview');await retry;assert.deepEqual(h.success,['local polygons','country overview']);assert.equal(h.delay,undefined);
  l.request('state');const old=h.tick();l.request('country');assert.equal(h.restored,1);h.requests[4].resolve('stale');await old;assert.equal(h.delay,undefined);assert.equal(h.success.length,2);
  l.request('fail');for(let i=0;i<3;i++){const p=h.tick();h.requests.at(-1).reject(Error('offline'));await p;}assert.equal(h.failure.at(-1)[1],false);assert.equal(h.delay,undefined);l.request('fail');assert.equal(h.delay,undefined);
  l.invalidate();l.request('fail');const fresh=h.tick();h.requests.at(-1).resolve('recovered');await fresh;assert.equal(h.success.at(-1),'recovered');
  l.request('another');const running=h.tick();l.invalidate();l.request('another');h.requests.at(-1).resolve('discard after invalidation');await running;const next=h.tick();h.requests.at(-1).resolve('after reload');await next;assert.equal(h.success.at(-1),'after reload');assert.ok(!h.success.includes('discard after invalidation'));
  console.log('Cellular viewport serialization, stale-response rejection, bounded retry and reload passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
