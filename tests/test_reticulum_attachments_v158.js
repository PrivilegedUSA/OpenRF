'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const script=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['reticulum-attachment-file','reticulum-attachment-preview','reticulum-attachment-status',
  'reticulum-attachment-remove','reticulum-send'])
  assert(html.includes(`id="${id}"`),`Missing file UI: ${id}`);
assert(!html.includes('placeholder="Write a message or attach a file…" required'),
  'File-only attachments must not require text');
assert(script.includes("'/api/reticulum/send'"));
assert(script.includes('new Uint8Array(await file.arrayBuffer())'),
  'User-selected bytes read only when operator presses Send');
assert(script.includes('payload.attachment={filename:file.name,data_base64:btoa(binary)}'));
assert(script.includes('attachment.available!==false'));
assert(script.includes('reticulum-message-attachment'));
assert(css.includes('.reticulum-message-attachment img'));
assert(!script.includes('innerHTML'),'Never render untrusted file names as HTML');
console.log('PASS v0.2.174 Reticulum one-file compose, preview and session-limited download controls');
