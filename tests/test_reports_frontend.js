'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('openrf/static/index.html','utf8');
const js = fs.readFileSync('openrf/static/app.js','utf8');
const css = fs.readFileSync('openrf/static/app.css','utf8');
assert(html.includes('id="session-report-select"'), 'session selection is required');
assert(html.includes('id="session-report-demo"') && html.includes('id="session-report-coordinates"'), 'explicit opt-in privacy switches');
assert(!html.includes('id="session-report-demo" checked') && !html.includes('id="session-report-coordinates" checked'), 'default report omits demo and precise coordinates');
for (const id of ['session-report-preview','session-report-html','session-report-json']) {
  assert(html.includes('id="'+id+'"'), 'export action '+id);
}
assert(js.includes('updateSessionReportSelector()') && js.includes('data-session-report='), 'session report action and select wired');
assert(js.includes('function sessionReportUrl(kind, download = false)'), 'reports must have scoped URLs');
assert(js.includes('include_demo:') && js.includes('include_coordinates:'), 'report options go to server');
assert(js.includes('window.open(url, \'_blank\', \'noopener\')'), 'local historical HTML preview in separate tab');
assert(css.includes('@media(max-width:620px){.report-options'), 'compact report controls');
console.log('v0.2.18 investigation report UI and privacy controls passed.');
