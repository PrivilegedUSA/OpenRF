'use strict';
// Verify independent sidebar unread badges and foreground catch-up polling.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const reticulum=fs.readFileSync('openrf/static/reticulum.js','utf8');

const parent=html.match(/id="messages-nav-toggle"[^>]*>([\s\S]*?)<\/button>/)?.[1]||'';
const meshChild=html.match(/id="mesh-nav-item"[^>]*>([\s\S]*?)<\/button>/)?.[1]||'';
const reticChild=html.match(/id="reticulum-nav-item"[^>]*>([\s\S]*?)<\/button>/)?.[1]||'';
assert(!parent.includes('mesh-nav-unread')&&!parent.includes('reticulum-nav-unread'),
  'The parent dropdown must not crowd the unread counter beside its arrow');
assert(meshChild.includes('Mesh messages')&&meshChild.includes('id="mesh-nav-unread"'));
assert(reticChild.includes('Reticulum')&&reticChild.includes('id="reticulum-nav-unread"'));
assert(css.includes('.sidebar .nav-subpages .nav-subpage .mesh-nav-unread{'));
assert(css.includes('display:inline-flex;align-items:center;justify-content:center;'),
  'Avoid inheriting inline-block from the generic sidebar span selector');
assert(css.includes('margin-left:auto;'),'Unread must align to the right, not float above labels');
assert(mesh.includes("['mesh-header-unread',count]")&&mesh.includes("['mesh-nav-unread',state.unread]"));
assert(mesh.includes("['reticulum-nav-unread',reticulumUnread]"));
assert(!mesh.includes('header.dataset.jump='),'The envelope opens the explicit inbox chooser');
assert(mesh.includes("['mesh-header-mesh-unread',state.unread]"));
assert(mesh.includes("['mesh-header-reticulum-unread',reticulumUnread]"));

function checkForegroundPolling(source,funcName,condition){
  const begin=source.indexOf('  const resumeInbox=');
  const end=source.indexOf(funcName,begin);
  assert(begin>=0&&end>begin,'Missing foreground refresh handler');
  const snippet=source.slice(begin,end);
  const handlers={window:{},document:{}};
  const ctx={state:{enabled:false,connected:false,busy:false},document:{hidden:false,
    addEventListener(type,handler){handlers.document[type]=handler;}},
    window:{addEventListener(type,handler){handlers.window[type]=handler;}},calls:0};
  vm.runInNewContext(`const state=globalThis.state;
    const loadMessages=()=>{globalThis.calls++;};
    const refreshInbox=()=>{globalThis.calls++;};
    ${snippet}`,ctx);
  assert.equal(typeof handlers.window.focus,'function');
  assert.equal(typeof handlers.document.visibilitychange,'function');
  handlers.window.focus();
  assert.equal(ctx.calls,condition==='enabled'?0:1,
    'Mesh reads only its local inbox; Reticulum never starts automatically');
  ctx.state[condition]=true;
  handlers.window.focus();
  const expected=condition==='enabled'?1:2;
  assert.equal(ctx.calls,expected,'Returning to app should refresh the inbox');
  ctx.document.hidden=true;
  handlers.document.visibilitychange();
  assert.equal(ctx.calls,expected,'A hidden tab does not trigger an unnecessary fetch');
  ctx.document.hidden=false;
  handlers.document.visibilitychange();
  assert.equal(ctx.calls,expected+1);
  ctx.state.busy=true;
  handlers.window.focus();
  assert.equal(ctx.calls,expected+1,'A busy operation should not be interrupted by a foreground poll');
}
checkForegroundPolling(mesh,'  renderButtons();','connected');
checkForegroundPolling(reticulum,'  updateControls();','enabled');
assert(!mesh.includes('innerHTML')&&!reticulum.includes('innerHTML'));
console.log('PASS v0.2.93 independent aligned sidebar unread and read-only focus refresh');
