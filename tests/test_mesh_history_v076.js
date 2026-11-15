'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
for(const id of ['mesh-save-history','mesh-clear-history','mesh-conversation','mesh-storage-label'])
  assert(html.includes(`id="${id}"`),id);
assert(mesh.includes("'/api/mesh/history'"));
assert(mesh.includes("'/api/mesh/history/clear'"));
assert(mesh.includes('Reply to this node'));
assert(mesh.includes("el('mesh-text').focus()"));
assert(mesh.includes('text.textContent=String(m.text||\'\')'));
assert(!mesh.includes('innerHTML'));
console.log('PASS v0.2.76 opt-in private history and safe conversation/reply controls');
