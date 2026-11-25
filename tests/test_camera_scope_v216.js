const fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('openrf/static/index.html','utf8'),css=fs.readFileSync('openrf/static/app.css','utf8');
const camera=html.indexOf('id="camera-map-manager"'),mesh=html.indexOf('id="public-mesh-manager"');
const section=html.slice(camera,mesh);
assert(section.includes('id="camera-download-national"'));assert(section.includes('id="camera-import-osm"'));
assert(section.includes('Import speed / red-light in view'));assert(section.includes('Update US ALPRs'));
assert(css.includes('.camera-map-manager{border-bottom:0;margin:10px 0 0;'));
console.log('PASS consolidated camera controls and single dividers');
