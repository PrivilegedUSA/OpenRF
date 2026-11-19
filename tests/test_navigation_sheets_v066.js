'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const js=fs.readFileSync('openrf/static/app.js','utf8');
const sheet=html.match(/<details id="map-directions-review"[\s\S]*?<\/details>/);
assert(sheet,'Directions details must exist');
const summary=sheet[0].indexOf('id="map-directions-summary"');
const actions=sheet[0].indexOf('class="map-directions-actions"');
const body=sheet[0].indexOf('class="map-directions-body"');
assert(summary>=0 && actions>summary && body>actions,'Summary and export controls before the scrollable turn body');
for(const id of ['map-print-directions','map-save-directions-html','map-save-directions-json']){
  const idx=sheet[0].indexOf(`id="${id}"`);
  assert(idx>actions && idx<body,`${id} must be pinned above turn scrolling`);
}
assert(css.includes('#page-map .map-directions-review,\n#page-map .map-route-choices,\n#page-map .map-destination-panel:not(.is-collapsed)'), 'Expanded panels share width constraint');
assert(css.includes('width:min(430px,calc(100% - 71px));'),'Navigation sheets leave the tool rail available');
assert(css.includes('top:var(--openrf-directions-summary-height,48px);'),'Export row sticky to actual summary height');
assert(css.includes('#page-map .map-directions-review[open] {\n  max-height:min(67dvh,520px);\n  overflow-y:auto;'),'One scrollable directions panel');
assert(css.includes('#page-map .map-directions-review > .map-directions-body {\n  overflow:visible;'),'No second scroll within turns');
assert(js.includes('function updateDirectionsStickyOffset()'),'Dynamic sticky header supports wrapped summaries');
assert(js.includes("new ResizeObserver(updateDirectionsStickyOffset).observe($('map-directions-summary'))"),'Dynamic resize updates sticky offset');
assert(html.includes('FIELD CONSOLE · 0.2.132'),'Version updated');
console.log('PASS v0.2.76 aligned navigation sheets, fixed exports and single scroll area');
