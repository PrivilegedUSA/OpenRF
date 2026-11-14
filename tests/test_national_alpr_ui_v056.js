'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../openrf/static');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'camera-layers.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app.css'),'utf8');
for (const id of ['camera-download-national','camera-snapshot-status','camera-import-file','camera-import-upload','camera-refresh','camera-import-osm']) {
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
}
for(const kind of ['ALPR','RED_LIGHT','SPEED'])assert(html.includes(`data-camera-type="${kind}"`));
assert(html.includes('nationwide ALPRs'));
assert(script.includes('/api/cameras/snapshot/update'));
assert(script.includes('/api/cameras/snapshot/upload'));
assert(script.includes('snapshotStatus()'));
assert(script.includes('Camera data unavailable'));
assert(css.includes('camera-snapshot-status'));
console.log('PASS v0.2.58 national download, local file fallback, offline map layers preserved');
