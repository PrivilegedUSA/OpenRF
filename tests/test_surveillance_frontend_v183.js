/* On-demand saved-video motion review; no implicit camera connection. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/surveillance.js','utf8');
for(const id of ['surveillance-motion-sensitivity','surveillance-motion-history','surveillance-motion-status','surveillance-motion-refresh']) {
  assert.match(html,new RegExp(`id="${id}"`));
  assert.ok(js.includes(id));
}
assert.match(js,/Scan for motion/);
assert.match(js,/\/motion-scan/);
assert.match(js,/motion-scans\/\$\{scan.recording_id\}/);
assert.match(js,/SOURCE VIDEO UNAVAILABLE/);
assert.match(js,/on-demand|No camera will be contacted/);
assert.match(html,/motion candidates/);
assert.match(js,/on-demand|No camera will be contacted/); // The separate opt-in live monitor polls status only while active.
console.log('Surveillance on-demand motion history UI checks passed');
