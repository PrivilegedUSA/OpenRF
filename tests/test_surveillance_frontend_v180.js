const assert = require('node:assert/strict');
const fs = require('node:fs');
const ui = fs.readFileSync('openrf/static/surveillance.js','utf8');
assert.match(ui,/Test connection/);
assert.match(ui,/data-action=probe/);
assert.match(ui,/\/probe`/);
assert.match(ui,/method: 'POST'/);
assert.match(ui,/Diagnostics not run/);
assert.match(ui,/checks\.delete\(camera\.id\)/);
assert.match(ui,/checks\.delete\(id\)/);
assert.match(ui,/if \(\$\('page-surveillance'\)\.classList\.contains\('active'\)/); // Only live-motion status gets polled.
console.log('Manual Surveillance camera diagnostics UI checks passed');
