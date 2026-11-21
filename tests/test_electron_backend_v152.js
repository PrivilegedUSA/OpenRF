'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {rootFor,checkHealth,ensureBackend,stopBackend,EXPECTED_VERSION}=
  require('../tools/openrf-electron/backend');
assert.equal(EXPECTED_VERSION,'0.2.169');
const sourceDir=path.resolve('tools/openrf-electron');
assert.equal(rootFor(null,sourceDir),path.resolve('.'));
(async()=>{
  const good=async()=>({ok:true,json:async()=>({status:'ok',version:'0.2.169'})});
  const old=async()=>({ok:true,json:async()=>({status:'ok',version:'0.2.151'})});
  const missing=async()=>{throw Error('not listening');};
  assert.equal((await checkHealth('http://127.0.0.1:8765/',good)).state,'ready');
  assert.equal((await checkHealth('http://127.0.0.1:8765/',old)).state,'occupied');
  assert.equal((await checkHealth('http://127.0.0.1:8765/',missing)).state,'unreachable');
  let spawned=0;
  const attached=await ensureBackend({url:'http://127.0.0.1:8765/',projectRoot:path.resolve('.'),get:good,
    start:()=>{spawned++;throw Error('must not spawn');}});
  assert.equal(attached.owned,false);assert.equal(spawned,0);
  await assert.rejects(()=>ensureBackend({url:'http://127.0.0.1:8765/',projectRoot:path.resolve('.'),get:old}),/Stop the old server/);
  let alive=false,options,child;
  const result=await ensureBackend({url:'http://127.0.0.1:8765/',projectRoot:path.resolve('.'),
    get:()=>alive?good():missing(),pause:async()=>{alive=true;},
    start:(python,args,opts)=>{
      assert.equal(python,'python3');assert.deepEqual(args,['-m','openrf','--port','8765']);
      options=opts;child=new EventEmitter();child.exitCode=null;child.killed=false;
      child.kill=signal=>{assert.equal(signal,'SIGTERM');child.killed=true;};
      return child;
    }});
  assert.equal(result.owned,true);assert.equal(options.cwd,path.resolve('.'));
  assert.equal(options.stdio[0],'ignore');
  stopBackend();assert.equal(child.killed,true);
  console.log('PASS v0.2.169 Electron attaches or starts owned loopback backend and stops only its child');
})().catch(error=>{console.error(error);process.exitCode=1;});
