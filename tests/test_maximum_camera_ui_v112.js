'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
assert(html.includes('id="route-camera-priority"'));
assert(html.includes('<option value="maximum">Maximum avoidance'));
assert(html.includes('cannot guarantee no cameras or verify road access'));
assert(app.includes("$('route-camera-priority').value=saved.priority==='maximum'?'maximum':'balanced'"));
assert(app.includes("priority:$('route-camera-priority').value"));
assert(app.includes("mode:$('route-camera-priority').value"),
  'Only opted-in comparison calls receive the explicit mode');
assert(app.includes("$('route-camera-priority').addEventListener('change'"));
assert(app.includes('Maximum avoidance recommends the alternate'));
assert(css.includes('.route-camera-priority select{width:100%;min-width:0;max-width:100%'),
  'Compact 800x480 popup does not force horizontal overflow');
assert(!app.includes('excluded_by_direction||0'),
  'Old subtractive lens bearing summary must not survive');
console.log('PASS v0.2.114 persisted opt-in maximum mode and conservative mapped-camera summary');
