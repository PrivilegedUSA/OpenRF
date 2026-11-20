'use strict';
/* v0.2.151: consistent locally bundled Font Awesome vector browser controls. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const icons={
  'browser-back':'0 0 448 512',
  'browser-forward':'0 0 448 512',
  'browser-reload':'0 0 512 512',
  'browser-home':'0 0 576 512',
};
for(const [id,box] of Object.entries(icons)){
  const button=html.match(new RegExp(`<button[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/button>`));
  assert(button,`Missing ${id}`);
  assert(button[1].includes(`<svg viewBox="${box}" fill="currentColor"`),`${id} should use Font Awesome SVG`);
  assert(button[1].includes('aria-hidden="true"'));
  assert(button[1].includes('<path d="'));
}
assert(html.includes('Font Awesome Free 6.7.2'));
assert(css.includes('.browser-navigation button svg'));
assert(html.includes('aria-label="Home · new tab"'));
console.log('PASS v0.2.151 browser navigation uses accessible Font Awesome Free solid vector controls');
