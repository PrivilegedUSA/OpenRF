'use strict';
// All non-map pages use their existing in-page heading and description once;
// shared topbar holds utility controls without a duplicated title.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const pages=['emergency','scanner','spectrum','radio','messages','reticulum','hamradio',
  'discoveries','sessions','hardware'];
for(const name of pages){
  const section=html.match(new RegExp(`<section class="page" id="page-${name}"[\\s\\S]*?(?=<section class="page" id="page-|$)`))?.[0]||'';
  assert(section.includes('class="section-heading"'),`page ${name} retains its own heading and tools`);
  assert(section.includes('<h2>'),`page ${name} retains one visible page heading`);
}
assert(html.includes('<div class="topbar-heading">'),'Existing header identity retained for semantics');
assert(css.includes('body:not(.map-workspace) .topbar-heading{display:none}'),
  'Shared non-map title hidden, not duplicated over the page heading');
assert(css.includes('body:not(.map-workspace) .topbar .field-clock-wrap{') &&
  css.includes('position:relative;left:auto;right:auto;transform:none;margin-left:0'),
  'Clock is aligned with controls, not absolutely centered over the offline-data status');
assert(css.includes('body:not(.map-workspace) .topbar .top-right{display:flex'),
  'Runtime badges retain dedicated left side on wide screens');
assert(css.includes('body.map-workspace .topbar{position:fixed'),
  'Full-screen map overlay layout remains separate');
assert(app.includes('const wasNavigationOpen=navigationOpen;') &&
  app.includes("document.querySelector(`#page-${page} .section-heading h2`)"),
  'Keyboard drawer navigation focuses visible page title, not hidden topbar title');
console.log('PASS v0.2.148 single title on all pages and uncluttered non-map clock alignment');
