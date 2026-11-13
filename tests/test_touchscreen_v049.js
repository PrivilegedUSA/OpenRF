'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'openrf/static/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'openrf/static/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'openrf/static/app.css'), 'utf8');
assert.equal((html.match(/id="map-destination-form"/g) || []).length, 1, 'keep exactly one navigation form');
for (const id of ['field-map-toggle', 'map-search-toggle', 'map-destination-panel']) {
  assert(html.includes(`id="${id}"`), `missing ${id}`);
}
assert(html.includes('aria-controls="map-destination-form" aria-expanded="true"'), 'collapser exposes form relationship');
assert(html.includes('aria-pressed="false" aria-label="Enable map focus mode" hidden'), 'focus mode is off by default');
assert(js.includes('mapSearchForm.hidden = isCollapsed'), 'collapse only affects the destination form');
assert(js.includes("mapSearchPanel.classList.toggle('is-collapsed', isCollapsed)"), 'collapsed panel has compact appearance');
assert(js.includes("mapSearchToggle.setAttribute('aria-expanded', String(!isCollapsed))"), 'screen reader state remains correct');
assert(js.includes("if (page !== 'map') fieldMapActive = false;"), 'leaving map exits focus mode');
assert(js.includes("requestAnimationFrame(() => {state.map?.resize(); state.rasterMap?.resize(); updateNavOverlayLayout();})"), 'both map renderers resize');
assert(css.includes('#page-map #map-destination-form[hidden]{display:none!important}'), 'form truly hidden');
assert(css.includes('body.field-map-mode #page-map> :not(.map-wrap){display:none!important}'), 'focus mode hides below-map workspace only');
assert(css.includes('.field-map-toggle[hidden]{display:none!important}'), 'button hidden elsewhere');
assert(html.includes('www.openstreetmap.org/copyright'), 'map attribution remains accessible');
assert(js.includes('stopNavigationFollow()'), 'navigation follow lifecycle is preserved');
assert(!js.includes('localStorage.setItem("field-map'), 'no intrusive persistent field tracking');
console.log('PASS v0.2.49 five-inch map focus and search collapse static contracts');
