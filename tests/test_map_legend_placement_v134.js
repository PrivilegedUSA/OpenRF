'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const section = css.split('/* v0.2.134 — bottom-left legend on wide map layouts.')[1];
assert(section, 'v0.2.134 legend layout section remains present');
const rule = section.match(/#page-map \.map-legend\s*\{([^}]*)\}/)?.[1];
assert(rule, 'widescreen map legend override exists');
assert(/\btop\s*:\s*auto\s*;/.test(rule), 'old top anchor cleared');
assert(/\bbottom\s*:\s*9px\s*;/.test(rule), 'aligned with the bottom credits control');
assert(/\bleft\s*:\s*44px\s*!important\s*;/.test(rule), 'offset beside the attribution icon overrides old !important left');
assert(/\bheight\s*:\s*auto\s*;/.test(rule), 'legend is not stretched vertically');
assert(css.includes('.map-wrap .map-legend{display:none;}'), 'compact map layout remains uncluttered');
assert(html.includes('id="map-credits"') && html.includes('www.openstreetmap.org/copyright'), 'required map attribution kept');
assert(html.includes('Survey location') && html.includes('DEMO (optional)'), 'survey and demo meanings kept');
console.log('PASS v0.2.148 bottom-left map legend and map credits');
