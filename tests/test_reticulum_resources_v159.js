'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum-files.js','utf8');
for(const id of ['reticulum-files-panel','reticulum-file-my-address','reticulum-file-announce',
    'reticulum-file-arm','reticulum-file-disarm','reticulum-file-destination',
    'reticulum-file-picker','reticulum-file-send','reticulum-file-transfers']){
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
}
assert(html.includes('/static/reticulum-files.js?v=0.2.159'));
assert(html.includes('different from LXMF chat'));
assert(js.includes('file.size>limit'));
assert(js.includes('confirm:true'));
assert(js.includes('receiving_armed_seconds'));
assert(js.includes('files/download/'));
assert(js.includes('CANCELED')===false,'UI must render reported status rather than fabricate cancellation');
console.log('PASS v0.2.159 manually armed 2 MiB Resource file send, progress, cancel and download contracts');
