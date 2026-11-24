/* v0.2.193: recording detail top gap and always-visible two-way sorting cues. */
'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const js=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
assert(js.includes("chevrons.setAttribute('class','surveillance-sort-chevrons')"));
assert(js.includes("[['up','2,7 7,2 12,7'],['down','2,11 7,16 12,11']]"));
assert(js.includes("button.append(chevrons)"));
assert(js.includes("recordingSortKey===key?",));
assert(js.includes("th.setAttribute('aria-sort',"));
assert(js.includes('recordingSortDesc=!recordingSortDesc'));
assert(css.includes('surveillance-expanded-row>td{padding:14px 12px 15px;'));
assert(css.includes('.is-sorted-asc .surveillance-sort-up'));
assert(css.includes('.is-sorted-desc .surveillance-sort-down'));
console.log('PASS v193 accessible visible sort chevrons and expanded-recording padding');
