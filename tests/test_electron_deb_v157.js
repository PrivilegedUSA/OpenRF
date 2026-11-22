'use strict';
/* Validates source packaging metadata without requiring Electron or a Pi. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const project=path.resolve(__dirname,'..');
const shell=path.join(project,'tools/openrf-electron');
const config=require(path.join(shell,'package.json'));
const projectVersion=fs.readFileSync(path.join(project,'openrf/__init__.py'),'utf8').match(/__version__\s*=\s*"([^"]+)"/)[1];
assert.equal(config.version,projectVersion);
assert.equal(config.build.appId,'org.openrf.fieldconsole');
assert.equal(config.build.linux.executableName,'openrf');
assert.equal(config.build.linux.syncDesktopName,true);
assert.equal(config.devDependencies.electron,'45.4.1');
assert.equal(config.devDependencies['electron-builder'],'26.18.1');
assert(config.build.deb.depends.includes('python3 (>= 3.11)'));
assert(config.build.extraResources.some(resource=>resource.to==='project/openrf'));
assert(config.build.extraResources.some(resource=>resource.to==='pi-startup.py'));
for(const resource of config.build.extraResources){
  assert(fs.existsSync(path.resolve(shell,resource.from)),`Missing package resource: ${resource.from}`);
}
const main=fs.readFileSync(path.join(shell,'main.js'),'utf8');
assert(main.includes("process.argv.includes('--openrf-kiosk')"));
assert(!main.includes("setFullScreen(true);\n  win.show();\n  win.setFullScreen"));
console.log('PASS v0.2.174 optional kiosk switch and Debian installer manifest');
