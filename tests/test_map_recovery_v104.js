'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'openrf/static/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'openrf/static/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'openrf/static/app.css'),'utf8');
assert.match(html, /<span class="messages-header-icon"><svg[^>]+>[\s\S]*?<span class="mesh-unread-badge" id="mesh-header-unread"/);
assert.match(css, /\.messages-header-icon\{position:relative/);
assert.match(css, /#mesh-header-button #mesh-header-unread\{position:absolute;top:-4px;right:-5px/);
assert.match(css, /body\.map-workspace \.topbar \.messages-header-button\{width:42px;height:42px\}/);
assert.match(js, /Vector renderer could not start \(\$\{state\.mapStartupError\}\)/);
assert.match(js, /Partially initialized renderer has no camera/);
assert.match(js, /await Promise\.race\(\[refreshOpenRFVectorMapStatus\(\),/);
assert.match(js, /openInitialPage\(\)\.catch/);
assert.match(js, /preferLocalVectorsAtBrowserFix\(lon,lat\);/);

function extract(from,to){const a=js.indexOf(from),b=js.indexOf(to,a);assert(a>=0&&b>a);return js.slice(a,b);}
const functions=extract('function regionalVectorReady(){','async function refreshOpenRFVectorMapStatus()');
const recovery=extract('function tryOfflineVectorRecovery(attempt){','function alignMapToolRail()');
const statusLabel={textContent:''};
const calls=[];
const initial={
  vectorStatus:{ready:true,fonts_ready:true,bounds:[-121.25,37.95,-119.7,38.95]},
  mapVectorPreference:'auto',mapVectorOffline:false,mapOfflineRecoveryTried:false,
  mapAttempt:2,mapReady:true,rasterMap:null,
  map:{setStyle(url){calls.push(url)}},
};
const env={state:initial,$:()=>statusLabel,updateOpenRFVectorButtons(){},
  openrfMapStyleUrl(){return '/api/vector/styles/dark.json'+(initial.mapVectorOffline?'?offline=1':'');},
  setTimeout(fn){calls.push(fn)},console:{warn(){}}};
vm.runInNewContext(functions+recovery,env);

assert.equal(env.regionalVectorReady(),true);
assert.equal(env.regionalVectorContains(-120.6,38.45),true);
assert.equal(env.regionalVectorContains(-98,39),false);
assert.equal(env.preferLocalVectorsAtBrowserFix(-98,39),false,'country overview must remain online');
assert.equal(env.preferLocalVectorsAtBrowserFix(-120.6,38.45),true,'verified browser fix inside local bounds selects offline');
assert.equal(initial.mapVectorOffline,true);
assert.deepEqual(calls,['/api/vector/styles/dark.json?offline=1']);
assert.match(statusLabel.textContent,/installed regional/);
assert.equal(env.preferLocalVectorsAtBrowserFix(-98,39),true,'fix outside regional extent restores worldwide source');
assert.equal(initial.mapVectorOffline,false);
assert.equal(calls[1],'/api/vector/styles/dark.json');
initial.mapVectorPreference='online';
assert.equal(env.preferLocalVectorsAtBrowserFix(-120.6,38.45),false,'explicit online choice must be respected');
initial.mapVectorPreference='offline';
assert.equal(env.preferLocalVectorsAtBrowserFix(-98,39),false,'explicit offline choice must be respected');
initial.mapVectorPreference='auto';
initial.mapReady=false;
assert.equal(env.tryOfflineVectorRecovery(2),true,'preloaded local map should be attempted before raster');
assert.equal(initial.mapVectorOffline,true);
assert.equal(initial.mapOfflineRecoveryTried,true);
assert.equal(calls[2],'/api/vector/styles/dark.json?offline=1');
assert.equal(typeof calls[3],'function','bounded recovery timeout must be installed');
assert.equal(env.tryOfflineVectorRecovery(2),true,'a second MapLibre error should wait for first offline retry');
assert.equal(calls.length,4,'no repeat network requests on each error');
initial.mapVectorPreference='online';
initial.mapVectorOffline=false;
initial.mapOfflineRecoveryTried=false;
assert.equal(env.tryOfflineVectorRecovery(2),false,'user-selected online must not silently switch');

console.log('v0.2.104 map source/recovery, offline preference, renderer failure notice, and envelope badge tests passed.');
