
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
assert(app.includes('function positionRouteChoicePanel()'), 'positioning helper exists');
assert(app.includes('heading.bottom-area.top+12'), '12px below actual heading');
assert(app.includes('positionRouteChoicePanel();\n}\nfunction chooseRouteChoice'), 'align after route choices render');
assert(app.includes('ResizeObserver(positionRouteChoicePanel)'), 'reposition if heading size changes');
assert(app.includes("window.addEventListener('resize',positionRouteChoicePanel)"));
assert(html.includes('FIELD CONSOLE · 0.2.143'));
console.log('PASS v0.2.76 route card alignment based on measured Directions heading');
