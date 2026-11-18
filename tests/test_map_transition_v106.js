'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'../openrf/static/app.js'),'utf8');
const start=js.indexOf("state.map.on('error', evt => {");
const end=js.indexOf("$('map-mode').textContent = 'Offline / raster';",start);
assert(start>0&&end>start,'map error handler exists');
const errorHandler=js.slice(start,end);
assert.match(errorHandler,/missing\/aborted tile/);
assert.match(errorHandler,/showVectorBasemapNotice/);
assert.doesNotMatch(errorHandler,/switchToRasterMap|tryOfflineVectorRecovery/,
  'one failed or aborted tile during style transition cannot destroy the vector renderer');

const timeoutStart=js.indexOf("$('map-mode').textContent = 'Offline / raster';",end);
const catchStart=js.indexOf('} catch (error) {',timeoutStart);
assert(timeoutStart>0&&catchStart>timeoutStart);
const watchdog=js.slice(timeoutStart,catchStart);
assert.match(watchdog,/showVectorBasemapNotice/);
assert.doesNotMatch(watchdog,/switchToRasterMap/,
  'slow network or missing regional tiles cannot drop the entire map into coordinate mode');

// A genuinely unavailable WebGL constructor or missing JS runtime can still
// fall back to the coordinate viewer, with an explicit renderer diagnostic.
assert.match(js,/Vector renderer could not start \(\$\{state\.mapStartupError\}\)/);
assert.match(js,/MapLibre JavaScript did not load/);
assert.match(js,/state\.map\.on\('style\.load',/);
assert.match(js,/preferLocalVectorsAtBrowserFix\(lon,lat\)/);
const recovery=js.slice(js.indexOf('function tryOfflineVectorRecovery('),js.indexOf('function alignMapToolRail()'));
assert.match(recovery,/showVectorBasemapNotice/);
assert.doesNotMatch(recovery,/switchToRasterMap/,
  'offline-recovery timeout must also keep the renderer alive');

console.log('v0.2.106 tile errors during browser-location vector source switching do not discard MapLibre.');
