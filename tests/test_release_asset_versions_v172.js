'use strict';
/* One canonical version assertion prevents stale release-number test fixtures. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const python=fs.readFileSync('openrf/__init__.py','utf8');
const version=python.match(/^__version__\s*=\s*"(\d+\.\d+\.\d+)"/m)?.[1];
assert(version,'Python backend release version is required');
assert(html.includes(`FIELD CONSOLE · ${version}`),'Sidebar release must match backend');
for(const name of ['app.css','app.js','app-settings.js','weather.js','mesh.js','meshcore.js',
                   'reticulum.js','reticulum-tabs.js','messaging-tabs.js','hardware-tabs.js','camera-layers.js','mesh-dashboard.js','public-mesh.js','survey_map.js','cellular-map.js']){
  assert(html.includes(`/static/${name}?v=${version}`),`Cache key for ${name} must match backend`);
}
const electron=JSON.parse(fs.readFileSync('tools/openrf-electron/package.json','utf8'));
assert.equal(electron.version,version,'Electron release must match backend');
const bundle=fs.readFileSync('BUNDLE_FORMAT.md','utf8');
assert(bundle.includes(`"version": "${version}"`));
console.log(`PASS v${version} canonical backend, UI, CSS, and Electron release identifiers`);
