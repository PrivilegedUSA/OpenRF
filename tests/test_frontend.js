// Dependency-free frontend regression: pure web mercator conversions and basic markup.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const src = fs.readFileSync('openrf/static/app.js', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const begin = src.indexOf('function worldPixel(');
const end = src.indexOf('function startRasterMap(', begin);
assert(begin >= 0 && end > begin);
const { worldPixel, pixelWorld } = Function(`${src.slice(begin, end)};return {worldPixel,pixelWorld}`)();
for (const position of [[-120.5, 38.1], [0, 0], [179.5, -15], [22.4, 71]]) {
  const pixel = worldPixel(position[0], position[1], 10);
  const roundtrip = pixelWorld(pixel[0], pixel[1], 10);
  assert(Math.abs(roundtrip[0] - position[0]) < 0.000001, `longitude ${position}`);
  assert(Math.abs(roundtrip[1] - position[1]) < 0.000001, `latitude ${position}`);
}
assert(/margin:0 auto;align-self:stretch/.test(css), 'page header must top-align');
assert(/#page-scanner > \.two-columns \{ margin-bottom: 20px; \}/.test(css), 'scanner panel gap');
assert(html.includes('maplibre-gl@5.24.0/dist/maplibre-gl.js'), 'must load compatible UMD MapLibre release');
assert(html.includes('id="map-mode"'), 'explicit raster fallback');
assert(html.includes('id="device-inventory"'), 'hardware device inventory');
console.log('Frontend regressions passed: projection, shared header alignment, scanner spacing, map and inventory controls.');
