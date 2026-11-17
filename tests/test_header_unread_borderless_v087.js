'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const rule=css.match(/#mesh-header-button #mesh-header-unread\{([^}]*)\}/)?.[1]||'';
assert(rule.includes('border:0;'),'Compact header unread number must have no outline');
assert(rule.includes('background:#34c9b1'),'Teal fill remains');
assert(rule.includes('top:8px;right:4px'),'Placement on envelope unchanged');
assert(rule.includes('min-width:13px;height:13px'),'Small size unchanged');
console.log('PASS v0.2.92 borderless teal unread badge');
