'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
for(const id of ['mesh-reply-conversation','mesh-byte-count','mesh-text'])
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(html.includes('/static/mesh.js?v=0.2.84'));
assert(mesh.includes("el('mesh-reply-conversation').addEventListener('click'"));
assert(mesh.includes('new TextEncoder().encode(el(\'mesh-text\').value).length'));
assert(mesh.includes('count>180'));
assert(mesh.includes('if(signature===lastRenderedSignature)return'));
assert(mesh.includes('wasNearBottom?box.scrollHeight:oldScroll'));
// UTF-8 byte count is deliberately not equivalent to JavaScript string length.
assert.equal(new TextEncoder().encode('🙂'.repeat(46)).length,184);
console.log('PASS v0.2.84 mesh composer and conversation UI checks');
