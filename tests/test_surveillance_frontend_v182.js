const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const js = fs.readFileSync('openrf/static/surveillance.js', 'utf8');
for (const id of ['surveillance-cleanup-review','surveillance-cleanup-apply','surveillance-cleanup-days','surveillance-cleanup-status']) {
  assert.match(html, new RegExp(`id="${id}"`));
  assert.ok(js.includes(id));
}
assert.match(js, /cleanup\/preview/);
assert.match(js, /cleanup\/apply/);
assert.match(js, /confirm\(`/);
assert.match(js, /invalidateReview\(\)/);
console.log('Surveillance manual retention UI checks passed');
