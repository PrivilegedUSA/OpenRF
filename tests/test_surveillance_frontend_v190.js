/* v190: reordered controls, bounded media widths and shared USB preview. */
'use strict';
const fs=require('node:fs');const assert=require('node:assert/strict');
const js=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
const start=js.indexOf('<div class="surveillance-overlay-bottom"');
const end=js.indexOf('</div>',start);const toolbar=js.slice(start,end);
const attrs=['data-feed-motion','data-feed-snapshot','data-feed-record','data-feed-view','data-feed-history'];
for(let i=0;i<attrs.length-1;i++)assert(toolbar.indexOf(attrs[i])<toolbar.indexOf(attrs[i+1]));
assert(js.includes('recorder will provide its OWN preview from one capture'));
assert(js.includes('USB recordings can now provide their own preview stream'));
assert.match(css,/\.surveillance-recording\{box-sizing:border-box;display:grid;grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/\.surveillance-recording \.surveillance-playback\{display:block;justify-self:center/);
console.log('PASS v190 Surveillance shared preview and layout');
