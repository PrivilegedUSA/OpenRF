'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
for(const name of ['reticulum-tcp-enable','reticulum-diagnostics-panel',
  'reticulum-diagnostics-refresh','reticulum-interfaces','reticulum-announce-detail'])
  assert(html.includes(`id="${name}"`),name);
assert(html.includes('OFF by default'));
assert(html.includes('port <strong>4242</strong>'));
assert(js.includes("{tcp_enabled:el('reticulum-tcp-enable').checked}"));
assert(js.includes("'/api/reticulum/diagnostics'"));
assert(js.includes('reachable_peers'));
assert(js.includes('announcement_received_by_peer')===false);
assert(js.includes('remote reception or delivery is verified'));
assert(!js.includes('innerHTML'),'User data must be inserted with textContent only');
console.log('PASS v0.2.86 optional direct TCP and truthful diagnostic UI');
